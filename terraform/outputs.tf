output "instance_id" {
  value = aws_instance.demo.id
}

output "public_ip" {
  value = aws_instance.demo.public_ip
}

output "private_ip" {
  value = aws_instance.demo.private_ip
}

output "availability_zone" {
  value = aws_instance.demo.availability_zone
}

output "key_name" {
  value = aws_key_pair.demo.key_name
}

output "private_key_pem" {
  value     = tls_private_key.demo.private_key_pem
  sensitive = true
}
